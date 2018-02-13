define(["./Route"], function NavPiece(Route) {

	var route = new Route();

	function NavPiece(pages) {

		var self = this;

		var activeIndex = new Datum(-1);

		var changedHash = false;

		var routeIndex = -1;

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
		};

		this.route = new Binding({

			init: function() {

				routeIndex =
					route.addRoute({

						set: function(route) {

							routePage(route);
						},
						get: function() {

							return pages[activeIndex()].route;
						}
					});
			},
			destroy: function() {

				route.remove(routeIndex);
			}
		});

		function routePage(hash) {

			if (changedHash) {

				changedHash = false;

				return;
			}

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					self.currentPage = pages[i].page;
					activeIndex(i);

					return;
				}
			}

			self.currentPage = pages[0].page;
			activeIndex(-1);
		}

		this.currentPage = pages[0].page;

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			if ("#" + pages[index].route == location.hash) {

				return;
			}

			this.currentPage = pages[index].page;
			location.hash = pages[index].route;
			changedHash = true;
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});
