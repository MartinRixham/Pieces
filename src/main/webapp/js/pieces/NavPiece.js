define(["./Route"], function NavPiece(Route) {

	var route = new Route();

	function NavPiece(pages) {

		var self = this;

		var currentIndex = new Datum(0);

		var activeIndex = new Datum(-1);

		var routeIndex = -1;

		this.currentPage = pages[0].page;

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var page = document.createElement("DIV");
			page.dataset.bind = "currentPage";

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "route";
			hidden.style.display = "none";

			element.appendChild(hidden);
			element.appendChild(page);

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex) {

						routePage(word);

						route.update(routeIndex);
					},
					get: function() {

						return pages[currentIndex()].route;
					}
				});
		};

		this.route = new Binding({

			destroy: function() {

				route.remove(routeIndex);
			}
		});

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					self.currentPage = pages[i].page;
					currentIndex(i);
					activeIndex(i);

					return;
				}
			}

			self.currentPage = pages[0].page;
			currentIndex(0);
			activeIndex(-1);
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			if ("#" + pages[index].route == location.hash) {

				return;
			}

			this.currentPage = pages[index].page;

			currentIndex(index);

			route.update(routeIndex);
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});
