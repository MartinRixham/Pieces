define(["./Route"], function NavPiece(Route) {

	var route = new Route();

	function NavPiece(pages) {

		var self = this;

		var currentIndex = new Datum(0);

		var activeIndex = new Datum(-1);

		var routeIndex = -1;

		var container = null;

		this.currentPage = pages[0].page;

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			container = document.createElement("DIV");
			container.dataset.bind = "currentPage";
			container.style.transition = "opacity 0.5s";

			element.appendChild(container);

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

			var oldIndex = currentIndex();

			if (oldIndex != index) {

				route.changePage(routeIndex);
			}

			currentIndex(index);

			route.update(routeIndex);

			container.style.opacity = "0";

			setTimeout(function() {

				self.currentPage = pages[index].page;
				container.style.opacity = "1";
			}, 500);
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});
